import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Import cleanup from react package directly
// Note: In @testing-library/react v14+, cleanup is auto-registered
// but we can still manually call it if needed
afterEach(async () => {
  // Cleanup is automatic in modern @testing-library/react
  // This file ensures jest-dom matchers are available
})
