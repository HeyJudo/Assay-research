import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { useReducedMotion } from '@/components/route-transition'

export function Startup() {
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'done'>('loading')
  const reduced = useReducedMotion()
  useEffect(() => {
    let active = true
    let finished = false
    let fadeTimer: number
    let removeTimer: number
    let frame = 0
    let secondFrame = 0
    // Fonts can stall on a connection. Bound the splash independently of them.
    const fonts = document.fonts?.ready ?? Promise.resolve()
    const fallback = window.setTimeout(finish, 1800)
    function finish() {
      if (!active || finished) return
      finished = true
      window.clearTimeout(fallback)
      const elapsed = performance.now()
      fadeTimer = window.setTimeout(() => {
        if (!active) return
        setPhase('leaving')
        removeTimer = window.setTimeout(() => { if (active) setPhase('done') }, reduced ? 0 : 280)
      }, reduced ? 0 : Math.max(0, 480 - elapsed))
    }
    fonts.then(() => {
      if (!active) return
      frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(finish) })
    }).catch(finish)
    return () => {
      active = false
      window.clearTimeout(fallback); window.clearTimeout(fadeTimer); window.clearTimeout(removeTimer)
      cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame)
    }
  }, [reduced])
  useEffect(() => {
    if (phase === 'done') return
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = old }
  }, [phase])
  if (phase === 'done') return null
  return <div className={`startup-overlay startup-${phase}`} role="status" aria-live="polite" aria-label="Opening Assay research workspace" tabIndex={-1}>
    <div className="startup-content"><div className="startup-emblem"><span className="startup-orbit" /><FlaskConical size={35} strokeWidth={1.6} /></div><div className="startup-wordmark">assay<span>.</span></div><p>RESEARCH WORKSPACE</p><div className="startup-loader" aria-hidden="true"><i /></div><small>Preparing your workspace</small></div>
  </div>
}
