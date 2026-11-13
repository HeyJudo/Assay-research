import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Keep the outgoing route mounted until its exit completes. Search/filter
 * changes update in place so forms and streaming state are not remounted. */
export function RouteTransition({ children }: { children: (location: ReturnType<typeof useLocation>) => ReactNode }) {
  const location = useLocation()
  const [displayed, setDisplayed] = useState(location)
  const [phase, setPhase] = useState<'enter' | 'exit' | 'idle'>('enter')
  const reduced = useReducedMotion()
  const surface = useRef<HTMLDivElement>(null)
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    if (location.pathname === displayed.pathname) {
      setDisplayed(location)
      setPhase(current => current === 'exit' ? 'idle' : current)
      return
    }
    setPhase('exit')
    const timer = window.setTimeout(() => {
      setDisplayed(location)
      setPhase('enter')
    }, reduced ? 0 : 150)
    return () => window.clearTimeout(timer)
  }, [location, displayed.pathname, reduced])

  useEffect(() => {
    const navigated = lastPath.current !== displayed.pathname
    if (navigated) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      surface.current?.focus({ preventScroll: true })
    }
    lastPath.current = displayed.pathname
    if (!displayed.hash) return
    const timer = window.setTimeout(() => {
      try { document.getElementById(decodeURIComponent(displayed.hash.slice(1)))?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' }) }
      catch { /* A malformed URL fragment must not prevent page navigation. */ }
    }, 100)
    return () => window.clearTimeout(timer)
  }, [displayed.pathname, displayed.hash, reduced])

  return <div ref={surface} tabIndex={-1} className={`route-surface route-${phase}`} aria-busy={phase === 'exit'} inert={phase === 'exit'} onAnimationEnd={event => {
    if (event.target === event.currentTarget && phase === 'enter') setPhase('idle')
  }}>{children(displayed)}</div>
}
