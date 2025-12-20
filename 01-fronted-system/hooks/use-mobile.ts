import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Initialize with false to match server-side rendering (which assumes desktop)
  // This is critical for hydration to work correctly
  const [isMobile, setIsMobile] = React.useState(false)

  // Track if we've mounted and hydration is complete
  // This prevents the hooks error during the SSR→hydration transition
  const [hasMounted, setHasMounted] = React.useState(false)

  React.useEffect(() => {
    // Mark as mounted after hydration is complete
    setHasMounted(true)

    // Check mobile state after mounting
    const checkMobile = () => window.innerWidth < MOBILE_BREAKPOINT
    setIsMobile(checkMobile())

    // Listen for resize changes
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(checkMobile())

    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // During SSR and initial hydration, always return false (desktop mode)
  // This ensures the React tree structure is consistent during hydration
  // Only after mount do we return the actual mobile state
  if (!hasMounted) {
    return false
  }

  return isMobile
}
