"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Check if it's an auth error and redirect to login
    const isAuthError =
      error.message?.includes("Refresh Token") ||
      error.message?.includes("refresh_token") ||
      error.message?.includes("not authenticated") ||
      error.message?.includes("Invalid Refresh Token") ||
      error.message?.includes("JWT")

    if (isAuthError) {
      window.location.href = "/login?reason=session_expired"
    }
  }, [error])

  return (
    <html>
      <body style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        backgroundColor: '#fff'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#FF6E50', marginBottom: '1rem' }}>
            Application Error
          </h1>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            A client-side error occurred. Check the browser console for details.
          </p>

          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            overflow: 'auto'
          }}>
            <p style={{
              fontFamily: 'monospace',
              fontSize: '14px',
              color: '#333',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              <strong>Error:</strong> {error.message}
            </p>
            {error.digest && (
              <p style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#888',
                marginTop: '0.5rem',
                marginBottom: 0
              }}>
                Digest: {error.digest}
              </p>
            )}
          </div>

          <div style={{
            backgroundColor: '#fff3f0',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '12px',
            fontFamily: 'monospace',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {error.stack}
            </pre>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#007A78',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                backgroundColor: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
