import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router'

export function RouteTransition({ children }: { children: (location: ReturnType<typeof useLocation>) => ReactNode }) {
  const location = useLocation()
  const reduced = useReducedMotion()
  const surface = useRef<HTMLDivElement>(null)
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      surface.current?.focus({ preventScroll: true })
    }
    lastPath.current = location.pathname
    if (!location.hash) return
    try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' }) }
    catch { /* Ignore malformed fragments. */ }
  }, [location.pathname, location.hash, reduced])

  return <motion.div key={location.pathname} ref={surface} tabIndex={-1} className="route-surface" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{children(location)}</motion.div>
}
