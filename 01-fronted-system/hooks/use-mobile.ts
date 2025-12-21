import * as React from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Hook to detect if the current viewport is mobile-sized.
 *
 * HYDRATION SAFETY:
 * - Returns `false` during SSR and initial hydration to match server render
 * - Updates to actual value after mount via useEffect
 * - This prevents hydration mismatches while ensuring correct mobile detection
 *
 * HOOKS STABILITY:
 * - All hooks are called unconditionally on every render
 * - Return value changes after mount, but hook count stays consistent
 */
export function useIsMobile() {
  // Track actual mobile state
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    // Check mobile state after mounting (client-side only)
    const checkMobile = () => window.innerWidth < MOBILE_BREAKPOINT
    setIsMobile(checkMobile())

    // Listen for resize changes
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(checkMobile())

    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // During SSR and initial hydration, return false (desktop mode)
  // After mount, return the actual mobile state
  // The useState default of false ensures consistent initial render
  return isMobile
}
