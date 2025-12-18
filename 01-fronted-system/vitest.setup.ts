import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test to prevent DOM pollution
afterEach(() => {
  cleanup()
})
