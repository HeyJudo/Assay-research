import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

export function CountUp({ value, format = value => Math.round(value).toLocaleString() }: { value: number | null | undefined; format?: (value: number) => string }) {
  const reduced = useReducedMotion()
  const [displayed, setDisplayed] = useState(0)
  const current = useRef(0)
  const available = value != null && Number.isFinite(value)
  useEffect(() => {
    if (!available || reduced) return
    const animation = animate(current.current, value!, { duration: .8, ease: [.16, 1, .3, 1], onUpdate: next => { current.current = next; setDisplayed(next) } })
    return () => animation.stop()
  }, [value, available, reduced])
  if (!available) return <span>N/A</span>
  return <span aria-label={format(value!)}><span aria-hidden="true">{format(reduced ? value! : displayed)}</span></span>
}
