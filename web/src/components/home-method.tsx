import { useRef, useState } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { CircleCheck, List, Repeat, Sliders, Snowflake, TriangleAlert as TrapStation } from 'kubai-icons-react'
import { BuiltOn } from '@/components/home-agents'

const stations = [
  { icon: Snowflake, title: 'Freeze the web', text: 'Every agent searches the same saved pages.' },
  { icon: TrapStation, title: 'Plant a trap', text: 'A fake article, a hidden instruction, or an outage.' },
  { icon: Repeat, title: 'Run it three times', text: 'One lucky pass does not count.' },
  { icon: List, title: 'Record every step', text: 'Searches, pages, model calls and cost.' },
  { icon: CircleCheck, title: 'Check every claim', text: 'Briefing claims are matched to source quotes.' },
  { icon: Sliders, title: 'Rank your way', text: 'Weigh accuracy, cost, traps and honesty.' },
]
const spring = { type: 'spring' as const, bounce: 0, duration: .45 }

// A vertical timeline at every width. The rail fills as the list scrolls past the middle of the screen,
// and each step lights up when the fill reaches it, so the sequence reads one step at a time.
export function HomeMethod() {
  const reduced = useReducedMotion() ?? false
  const list = useRef<HTMLOListElement>(null)
  const { scrollYProgress } = useScroll({ target: list, offset: ['start 62%', 'end 62%'] })
  const fill = useSpring(scrollYProgress, { stiffness: 160, damping: 32, restDelta: .001 })
  const [lit, setLit] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', value => {
    const next = Math.min(stations.length, Math.floor(value * stations.length + .35))
    setLit(current => current === next ? current : next)
  })
  const litCount = reduced ? stations.length : lit
  return <section className="home-section home-method" id="methodology">
    <div className="home-method-grid">
      <div className="home-method-intro">
        <h2>How a run works</h2>
        <p>The same six steps for every agent on every task.</p>
      </div>
      <ol className="home-timeline" ref={list}>
        <span className="home-timeline-rail" aria-hidden="true"><motion.span style={{ scaleY: reduced ? 1 : fill }} /></span>
        {stations.map(({ icon: Glyph, title, text }, index) => {
          const on = index < litCount
          return <motion.li key={title} className={on ? 'is-lit' : undefined}
            {...(reduced ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .4 }, transition: spring })}>
            <motion.span className="home-timeline-icon" animate={{ scale: on || reduced ? 1 : .9 }} transition={spring}>
              <Glyph size={26} color="var(--primary)" variant="soft" trigger="none" />
            </motion.span>
            <div><h3>{title}</h3><p>{text}</p></div>
          </motion.li>
        })}
      </ol>
    </div>
    <BuiltOn />
  </section>
}
